const needle = require('needle')
const config = require('./config')
const http = require('http')
const parseUrl = require('url').parse

const redis = require('redis').createClient({
  host: 'redis-12799.c114.us-east-1-4.ec2.cloud.redislabs.com',
  port: 12799,
  password: process.env.REDIS_PASS
})

redis.on('error', err => { console.error('Redis error', err) })

function cacheGet(type, key, cb) {
	if (cache[type][key])
		cb(cache[type][key])
	else
		redis.get(type + ':' + key, (err, res) => {
			cb(!err && res ? res : false)
		})
}

function cacheSet(type, key, data, ttl) {
	cache[type][key] = data
	if (ttl) {
		setTimeout(() => {
			delete cache[type][key]
		}, ttl)
		redis.setex(type + ':' + key, ttl / 1000, data)
	} else
		redis.set(type + ':' + key, data)
}

const base64 = {
	atob: str => { return Buffer.from(str, 'base64').toString('binary') },
}

const cache = {
	streams: {},
	maps: {},
	timelapse: {}
}

const headers = {
	'Host': 'www.skylinewebcams.com',
	'Origin': 'https://www.skylinewebcams.com',
	'Referer': 'http://www.skylinewebcams.com/',
	'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.113 Safari/537.36'
}

const mobileHeaders = JSON.parse(JSON.stringify(headers))
mobileHeaders['User-Agent'] = 'Mozilla/5.0 (Linux; U; Android 2.2) AppleWebKit/533.1 (KHTML, like Gecko) Version/4.0 Mobile Safari/533.1'


function verifyStream(url, cb) {
	// if playlist isn't requested for more then 2 mins, the token gets invalidated
	// so we check the playlist to see if it expired or not
	needle.get(url, { headers }, (err, resp, body) => {
		cb(body && typeof body == 'string' ? !body.includes('#EXT-X-ENDLIST') : false)
	})
}

function verifyTimelapse(url, cb) {
	const uri = parseUrl(url)
	const options = {
		method: 'HEAD',
		host: uri.host,
		port: uri.port,
		path: uri.pathname
	}
	const req = http.request(options, r => {
		cb(((r || {}).headers || {})['content-type'] == 'video/mp4')
	})
	req.end()
}

function getStreamMobile(url, cb, forced) {
	// mobile page is smaller, but doesn't have map
	cacheGet('streams', url, cached => {
		if (cached && !forced) {
			verifyStream(cached, isValid => {
				if (isValid)
					cb([{ url: cached, title: 'Live' }])
				else {
					delete cache.streams[url]
					getStreamMobile(url, cb, true)
				}
			})
		} else {
			needle.get(url, { headers: mobileHeaders }, (err, resp, body) => {
				if (body && typeof body == 'string') {
					const matches = body.match(/<source src="[^"]+/gm)
					if ((matches || []).length) {
						const streams = []
						const stream = matches[0].substr(13)
						cacheSet('streams', url, stream)
						streams.push({ title: 'Live', url: stream })
						cb(streams)
					} else
						cb(false)
				} else
					cb(false)
			})
		}
	})
}

function getStream(url, cb) {
	cacheGet('maps', url, cached => {
		if (cached) {
			// have map, get phone version
			getStreamMobile(url, streams => {
				cb((streams || []).concat([{ externalUrl: cached, title: 'View on Map' }]))
			})
		} else {
			needle.get(url, { headers }, (err, resp, body) => {
				if (body && typeof body == 'string') {
					const matches = body.match(/source:"[^"]+/gm)
					if ((matches || []).length) {
						const streams = []
						const stream = matches[0].substr(8)
						cacheSet('streams', url, stream)
						streams.push({ title: 'Live', url: stream })
						const mapMatches = body.match(/href="\/skyline\/webcammap\.php\?w=[^"]+/gm)
						if ((mapMatches || []).length) {
							const mapUrl = 'https://www.skylinewebcams.com' + mapMatches[0].substr(6)
							cacheSet('maps', url, mapUrl)
							streams.push({ title: 'View on Map', externalUrl: mapUrl })
						}
						cb(streams)
					} else
						cb(false)
				} else
					cb(false)
			})

		}
	})
}

function getTimelapse(url, cb, forced) {
	// get timelapse
	cacheGet('timelapse', url, cached => {
		if (cached && !forced) {
			verifyTimelapse(cached, isValid => {
				if (isValid)
					cb([{ url: cached, title: 'Timelapse' }])
				else
					getTimelapse(url, cb, true)
			})
		} else
			needle.get(url + '?timelapse=1', { headers }, (err, resp, body) => {
				if (body && typeof body == 'string') {
					const tlMatches = body.match(/source:"[^"]+/gm)
					if ((tlMatches || []).length) {
						const streams = []
						const tlStream = tlMatches[0].substr(8)
						if (!tlStream.endsWith('/.mp4')) {
							cacheSet('timelapse', url, tlStream, config.timelapseCacheTime)
							streams.push({ title: 'Timelapse', url: tlStream })
							cb(streams)
						} else
							cb(false)
					} else
						cb(false)
				} else
					cb(false)
			})
	})
}

module.exports = (prefix, args) => {
	return new Promise((resolve, reject) => {
		const url = 'https://www.skylinewebcams.com' + base64.atob(args.id.replace(prefix, '').split(':')[0])
		getStream(url, results => {
			getTimelapse(url, timelapse => {
				const streams = (results || []).concat((timelapse || []))
				if (streams.length)
					resolve({ streams, cacheMaxAge: config.streamCacheTime })
				else
					reject('No streams found for: ' + args.id)
			})
		})
	})
}
