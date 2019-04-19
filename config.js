
const day = 86400000
const hour = 3600000
const min = 60000

// if playlist isn't requested for more then 2 mins, the token gets invalidated

// timelapse also seems to expire, unsure when, setting to 1 day for safety

module.exports = {
	cacheTime: 30 * day,
	streamCacheTime: 2 * min,
	timelapseCacheTime: 1 * day
}
