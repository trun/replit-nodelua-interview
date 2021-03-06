import express from 'express'
import * as bodyParser from 'body-parser'
import vm, { Context } from 'vm'
const LuaContext = require('node-luajit')

type EvalRequest = {
  code: string
}

type EvalResponse = {
  success: true
  objects: Record<Reference, Object>
  value: Value
} | {
  success: false
  error: string
}

type Value = null | Boolean | Number | String | ObjectRef
type Boolean = {
  kind: 'boolean'
  value: boolean
}
type Number = {
  kind: 'number'
  value: number
}
type String = {
  kind: 'string'
  value: string
}
type ObjectRef = {
  kind: 'ref'
  value: Reference
}

type Reference = string
type Key = Value
type Object = {
  members: Array<ObjectMember>
}
type ObjectMember = {
  key: Key
  value: Value
}

// TODO why do i need to `any` type the LuaState
const luaSessions: { [session: string]: any } = {}
const jsSessions: { [session: string]: Context } = {}

const luaSessionLocks: { [session: string]: boolean } = {}

const app = express()

app.use(bodyParser.json())

app.get('/status', (req, res) => {
  res.status(200).send('OK')
})

const retToValue = (ret: any, objects: Record<Reference, Object>, nextId: (() => number), refs: Record<Reference, any> = {}): Value => {
  if (typeof ret === 'undefined') {
    return null
  }

  if (typeof ret === 'boolean') {
    return { kind: 'boolean', value: ret }
  }

  if (typeof ret === 'string') {
    return { kind: 'string', value: ret }
  }

  if (typeof ret === 'number') {
    return { kind: 'number', value: ret }
  }

  if (typeof ret === 'object') {
    const foundRef = Object.entries(refs).find(([refId, ref]) => ref === ret)
    if (foundRef) {
      return { kind: 'ref', value: String(foundRef[0]) }
    } else {
      const refId = nextId()

      refs[refId] = ret

      const members = Object.entries(ret).map(([k, v]) => ({
        key: retToValue(k, objects, nextId, refs),
        value: retToValue(v, objects, nextId, refs)
      }))

      objects[refId] = {
        members,
      }

      return { kind: 'ref', value: String(refId) }
    }
  }
}

const makeIdGenerator = (initialValue: number = 1): (() => number) => {
  let x = initialValue
  return (): number => {
    return x++
  }
}

app.post('/eval/:session/lua', (req, res) => {
  const session = req.params.session

  // this isn't really "thread-safe", but it should never get interrupted in normal single threaded js execution
  if (luaSessionLocks[session]) {
    return res.status(500).send({
      success: false,
      error: `Could not obtain lock for session: ${session}`
    })
  }
  luaSessionLocks[session] = true

  let context
  if (session in luaSessions) {
    context = luaSessions[session]
  } else {
    context = luaSessions[session] = new LuaContext()
  }

  const evalReq: EvalRequest = req.body

  try {
    context.doString(evalReq.code, (err: any, ret: any) => {
      luaSessionLocks[session] = false // we can unlock here, but in theory the FE still hasn't updated

      try {
        if (err) {
          res.status(200).send({
            success: false,
            error: err,
          })
        } else {
          const objects: Record<Reference, Object> = {}
          const value = retToValue(ret, objects, makeIdGenerator())
          res.status(200).send({
            success: true,
            objects,
            value,
          })
        }
      } catch (e) {
        console.error('Caught exception evaluating lua return value', e)
        res.status(500).send({
          error: e.message
        })
      }
    })
  } catch (e) {
    luaSessionLocks[session] = false
    console.error('Caught exception evaluating lua script', e)
    res.status(500).send({
      error: e.message
    })
  }
})

app.post('/eval/:session/js', (req, res) => {
  const session = req.params.session

  let context: Context
  if (session in jsSessions) {
    context = jsSessions[session]
  } else {
    context = jsSessions[session] = vm.createContext({})
  }

  const evalReq: EvalRequest = req.body

  try {
    const ret = vm.runInContext(evalReq.code, context)
    const objects: Record<Reference, Object> = {}
    const value =  retToValue(ret, objects, makeIdGenerator())
    res.status(200).send({
      success: true,
      objects,
      value,
    })
  } catch (e) {
    console.error('Caught exception evaluating js return value', e)
    res.status(500).send({
      error: e.message
    })
  }

})

app.listen(3001, () => {
  console.log("Server started on port 3001!")
})
