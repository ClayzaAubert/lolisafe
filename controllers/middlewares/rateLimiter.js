const { RateLimiterMemory } = require('rate-limiter-flexible')
const ClientError = require('./../utils/ClientError')

class RateLimiter {
  rateLimiterMemory

  #requestKey
  #whitelistedKeys

  constructor (requestKey, options = {}, whitelistedKeys) {
    if (typeof options.points !== 'number' || typeof options.duration !== 'number') {
      throw new Error('Points and Duration must be set with numbers in options')
    }

    if (whitelistedKeys && typeof whitelistedKeys instanceof Set) {
      throw new TypeError('Whitelisted keys must be a Set')
    }

    this.#requestKey = requestKey
    this.#whitelistedKeys = new Set(whitelistedKeys)

    this.rateLimiterMemory = new RateLimiterMemory(options)
  }

  async #middleware (req, res, next) {
    if (res.locals.rateLimit) return

    // If unset, assume points pool is shared to all visitors of each route
    const key = this.#requestKey ? req[this.#requestKey] : req.path

    if (this.#whitelistedKeys.has(key)) {
      // Set the Response local variable for earlier bypass in any subsequent RateLimit middlewares
      res.locals.rateLimit = 'BYPASS'
      return
    }

    // Always consume only 1 point
    await this.rateLimiterMemory.consume(key, 1)
      .then(result => {
        res.locals.rateLimit = result
        res.set('Retry-After', String(result.msBeforeNext / 1000))
        res.set('X-RateLimit-Limit', String(this.rateLimiterMemory._points))
        res.set('X-RateLimit-Remaining', String(result.remainingPoints))
        res.set('X-RateLimit-Reset', String(new Date(Date.now() + result.msBeforeNext)))
      })
      .catch(reject => {
        // Re-throw with ClientError
        throw new ClientError('Rate limit reached, please try again in a while.', { statusCode: 429 })
      })
  }

  get middleware () {
    return this.#middleware.bind(this)
  }
}

module.exports = RateLimiter
