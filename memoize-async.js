const cache = {}

module.exports = fn => {
  return async function () {
    const serializedKey = JSON.stringify(arguments)

    cache[serializedKey] = cache[serializedKey] || await fn.apply(fn, arguments)

    return cache[serializedKey]
  }
}
