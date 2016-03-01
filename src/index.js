'use strict'

var request = require('request')
var cheerio = require('cheerio')
var qs = require('querystring')
var url = require('url')
var iconv = require('iconv-lite')
var _ = require('underscore')

/**
 * @param  {string} location Location that you want to pull movie showtimes for.
 * @param  {object} options  Object containing available options (like: lang, date, or pageLimit).
 * @return {object}
 */
var Showtimes = function (location, options) {
  this.userAgent = 'showtimes (http://github.com/erunion/showtimes)'
  this.baseUrl = 'http://google.com/movies'
  this.location = location

  // Handle available options
  if (typeof options === 'undefined') {
    options = {}
  }

  this.date = typeof options.date !== 'undefined' ? options.date : 0
  this.lang = typeof options.lang !== 'undefined' ? options.lang : 'en'
  this.pageLimit = typeof options.pageLimit !== 'undefined' ? options.pageLimit : 999
}

/**
 * Parse and pull back an object of movie theaters for the currently configured location and date.
 * @param  {string=}  query         Query string which works as a way to filter the theaters.
 * @param  {Function} cb            Callback function to run after generating an object of theaters.
 * @param  {number=}  [page=1]      Paginated page to pull theaters from. Hidden API, and is only used internally.
 * @param  {object=}  [theaters=[]] Currently generated theaters. Hidden API, and is only used internally.
 * @return void
 */
Showtimes.prototype.getTheaters = function () {
  this.page = 1
  this.theaters = []

  var query = (typeof arguments[0] !== 'function') ? arguments[0] : null
  var cb = (typeof arguments[0] === 'function') ? arguments[0] : arguments[1]
  var extraIdx = (typeof arguments[0] === 'function') ? 1 : 2

  if (arguments.length > extraIdx) {
    this.page = arguments[extraIdx]
    this.theaters = arguments[extraIdx + 1]
  }

  var api = this
  this._request({q: query}, cb, function (response) {
    if (api.lang === 'tr') {
      response = iconv.decode(response, 'latin5')
    }

    var $ = cheerio.load(response)
    if ($('.theater').length === 0) {
      cb($('#results').text())
      return
    }

    var location = $('#title_bar').text().match(/^Showtimes for (.+)$/)[1]
    var day = $('#left_nav .section div b').first().text().match(/^›\s*(.+)$/)[1]

    $('.theater').each(function (i, theater) {
      var theaterData = api._parseTheater($, $(theater))
      if (theaterData.name.length === 0) {
        return true
      }

      api.theaters.push(theaterData)
    })

    // No pages to paginate, so return the theaters back.
    if ($('#navbar td a:contains("Next")').length === 0 || api.page === api.pageLimit) {
      cb(null, {
        location: location,
        date: day,
        data: api.theaters
      })
      return
    }

    // Use the hidden API of getTheaters to pass in the next page and current theaters.
    api.getTheaters(query, cb, ++api.page, api.theaters)
  })
}

/**
 * Parse and pull back a standardized object for a given movie.
 * @param  {string}   theaterId  Theater ID for the theater you want to query. This can be obtained via getTheaters(),
 *                               or getMovies()
 * @param  {Function} cb         Callback function to run after generating a standardized object for this theater.
 * @return {void}
 */
Showtimes.prototype.getTheater = function (theaterId, cb) {
  var api = this
  this._request({tid: theaterId}, cb, function (response) {
    var $ = cheerio.load(response)
    if (!$('.showtimes')) {
      cb($('#results').text())
      return
    }

    var location = $('#title_bar').text().match(/^Showtimes for (.+)$/)[1]
    var day = $('#left_nav .section div b').first().text().match(/^›\s*(.+)$/)[1]

    var theater = $('.theater')
    var theaterData = api._parseTheater($, theater, false, theaterId)

    cb(null, {
      location: location,
      date: day,
      data: theaterData
    })
  })
}

/**
 * Parse and pull back an object of movies for the currently configured location and date.
 * @param  {string=}  query        Query string which works as a way to filter the movies.
 * @param  {Function} cb           Callback function to run after generating an object of movies.
 * @param  {number=}  [page=1]     Paginated page to pull movies from. Hidden API, and is only used internally.
 * @param  {object=}  [movies=[]]  Currently generated movies. Hidden API, and is only used internally.
 * @return void
 */
Showtimes.prototype.getMovies = function () {
  this.page = 1
  this.movies = []

  var query = (typeof arguments[0] !== 'function') ? arguments[0] : null
  var cb = (typeof arguments[0] === 'function') ? arguments[0] : arguments[1]
  var extraIdx = (typeof arguments[0] === 'function') ? 1 : 2

  if (arguments.length > extraIdx) {
    this.page = arguments[extraIdx]
    this.movies = arguments[extraIdx + 1]
  }

  var api = this
  this._request({sort: 1, q: query}, cb, function (response) {
    if (api.lang === 'tr') {
      response = iconv.decode(response, 'latin5')
    }

    var $ = cheerio.load(response)
    if ($('.movie').length === 0) {
      cb($('#results').text())
      return
    }

    var location = $('#title_bar').text().match(/^Showtimes for (.+)$/)[1]
    var day = $('#left_nav .section div b').first().text().match(/^›\s*(.+)$/)[1]

    var movieData
    $('.movie').each(function (i, movie) {
      movie = $(movie)
      movieData = api._parseMovie($, movie, true)
      if (!movieData) {
        return
      }

      delete movieData.showtimes
      movieData.theaters = []

      movie.find('.showtimes .theater').each(function (j, theater) {
        movieData.theaters.push(api._parseTheater($, $(theater), true))
      })

      if (movie.find('.showtimes p.show_more').length) {
        movieData.more_theaters = true;
      }

      api.movies.push(movieData)
    })

    // No pages to paginate, so return the movies back.
    if ($('#navbar td a:contains("Next")').length === 0 || api.page === api.pageLimit) {
      cb(null, {
        location: location,
        date: day,
        data: api.movies
      })
      return
    }

    // Use the hidden API of getMovies to pass in the next page and current
    // movies.
    api.getMovies(query, cb, ++api.page, api.movies)
  })
}

/**
 * Parse and pull back a standardized object for a given movie.
 * @param  {string}   movieId  Movie ID for the movie you want to query. This can be obtained via getTheaters(), or
 *                             getMovies()
 * @param  {Function} cb       Callback function to run after generating a standardized object for this movie.
 * @return {void}
 */
Showtimes.prototype.getMovie = function (movieId, cb) {
  var api = this
  this._request({mid: movieId}, cb, function (response) {
    var $ = cheerio.load(response)
    if (!$('.showtimes')) {
      cb($('#results').text())
      return
    }

    var movie = $('.movie')
    var movieData = api._parseMovie($, movie, true, movieId)

    delete movieData.showtimes
    movieData.theaters = []

    movie.find('.showtimes .theater').each(function (j, theater) {
      movieData.theaters.push(api._parseTheater($, $(theater), true))
    })

    var location = $('#title_bar').text().match(/^Showtimes for (.+)$/)[1]
    var day = $('#left_nav .section div b').first().text().match(/^›\s*(.+)$/)[1]

    cb(null, {
      location: location,
      date: day,
      data: movieData
    })
  })
}

/**
 * Parse theater information to generate a standardized response.
 * @param  {object}  $         Raw Cheerio object from a cheerio.load() call, used to parse movies for the given
 *                             theater.
 * @param  {object}  theater   Cheerio object for the theater that you want to parse.
 * @param  {boolean} alternate If you are parsing a theater from a "movie sort", pass true to use alternate scraper
 *                             logic.
 * @return {object}            Standardized response for the parsed theater.
 */
Showtimes.prototype._parseTheater = function ($, theater, alternate, theaterId) {
  alternate = (typeof alternate === 'undefined') ? false : alternate

  var api = this

  if (typeof theaterId === 'undefined') {
    var cloakedUrl
    if (alternate) {
      cloakedUrl = theater.find('.name a').attr('href')
    } else {
      cloakedUrl = theater.find('.desc h2.name a').attr('href')
    }
    // Get the ID from left links
    if (typeof cloakedUrl === 'undefined') {
      cloakedUrl = $('#left_nav .section a').attr('href')
    }

    theaterId = false
    if (cloakedUrl) {
      cloakedUrl = qs.parse(url.parse(cloakedUrl))
      if (typeof cloakedUrl.tid !== 'undefined') {
        theaterId = cloakedUrl.tid
      }
    }
  }

  var info = theater.find('.desc .info').text().split(' - ')

  if (alternate) {
    var showtimes = api._parseShowtimes($, $(theater))

    var theaterData = {
      id: theaterId,
      name: theater.find('.name').text(),
      address: theater.find('.address').text(),
      showtimes: showtimes.showtimes
    }
    if (showtimes.showtime_tickets) theaterData.showtime_tickets = showtimes.showtime_tickets

    return theaterData
  }

  var movies = []
  theater.find('.showtimes .movie').each(function (j, movie) {
    movie = api._parseMovie($, $(movie))
    if (movie) {
      movies.push(movie)
    }
  })

  return {
    id: theaterId,
    name: theater.find('.desc h2.name').text(),
    address: info[0] ? info[0].trim() : '',
    phoneNumber: info[1] ? info[1].trim() : '',
    movies: movies
  }
}

/**
 * Parse movie information to generate a standardized response.
 * @param  {object}  $         Raw Cheerio object from a cheerio.load() call, used to parse movies for the given
 *                             theater.
 * @param  {object}  movie     Cheerio object for the movie that you want to parse.
 * @param  {boolean} alternate If you are parsing a movie from a "movie sort", pass true to use alternate scraper
 *                             logic.
 * @param  {string}  movieId   If calling this from getMovie(), this is a movie ID representation for the movie you are
 *                             parsing.
 * @return {object}            Standardized response for the parsed movie.
 */
Showtimes.prototype._parseMovie = function ($, movie, alternate, movieId) {
  if (typeof alternate === 'undefined') {
    alternate = false
  }

  var name = alternate ? movie.find('h2[itemprop=name]').text() : movie.find('.name').text()

  // If the movie doesn't have a name, then there's a good chance that the theater attached to this isn't showing
  // anything, so let's just not set a movie here.
  if (name === '') {
    return false
  }

  if (typeof movieId === 'undefined') {
    var cloakedUrl
    if (alternate) {
      cloakedUrl = movie.find('.header .desc h2[itemprop=name] a').attr('href')
    } else {
      cloakedUrl = movie.find('.name a').attr('href')
    }
    // Get the Id from left links XD
    if (typeof cloakedUrl === 'undefined') {
      cloakedUrl = $('#left_nav .section a').attr('href')
    }

    movieId = qs.parse(url.parse(cloakedUrl).query).mid
  }

  // Movie info format: RUNTIME - RATING - GENRE - TRAILER - IMDB
  // Some movies don't have a rating, trailer, or IMDb pages, so we need to account for that.
  var info
  if (alternate) {
    // Genre and director data are separated by a line break instead of a hyphen, so hack a line break into the HTML
    // we have generated, so we can split that apart to grab the genre without adding a lot more complexity to the
    // process.
    var content = movie.find('.info').eq(-1).html()
    content = content.replace('<br>', ' - ')
    movie.find('.info').eq(-1).html(content)

    info = movie.find('.info').eq(-1).text().split(' - ')
  } else {
    info = movie.find('.info').text().split(' - ')
  }

  var runtime, rating, genre
  if (info[0].match(/(hr |min)/)) {
    runtime = this._removeNonAsciiCharacters(info[0].trim())
    if (!info[1]) {
      info[1] = ''
    }

    if (info[1].match(/Rated/)) {
      rating = this._removeNonAsciiCharacters(info[1].replace(/Rated/, '').trim())
      if (typeof info[2] !== 'undefined') {
        if (info[2].match(/(IMDB|Trailer)/i)) {
          genre = false
        } else {
          genre = info[2].trim().split('/')
        }
      } else {
        genre = false
      }
    } else {
      rating = false

      if (info[1].match(/(IMDB|Trailer)/i)) {
        genre = false
      } else {
        genre = info[1].trim().split('/')
      }
    }
  } else {
    runtime = false
    rating = false
    genre = info[0].trim()
  }

  if (genre) {
    genre = this._removeNonAsciiCharacters(genre)
  }

  // If we're running this from getMovie(), then let's grab some move fluff data on the movie.
  if (alternate && movieId) {
    var director, cast
    for (var x in info) {
      if (info[x].match(/Director:/)) {
        director = info[x].replace(/Director:/, '').trim()
      } else if (info[x].match(/Cast:/)) {
        cast = info[x].replace(/Cast:/, '').trim().split(', ')
      }
    }

    // Longer descriptions can be split between two spans and displays a more/less link
    var description = movie.find('span[itemprop="description"]').text()
    movie.find('#SynopsisSecond0').children().last().remove()
    description = description + movie.find('#SynopsisSecond0').text()
    description.replace('/"/', '')
    description = description.trim()
  }

  // The movie sort has a different formatting for showtimes, so if we're parsing that, handle it inside of
  // _getMovies() instead.
  var showtimes = { showtimes: [] }
  if (!alternate) {
    showtimes = this._parseShowtimes($, movie)
  }

  var movieData = {
    id: movieId,
    name: name,
    runtime: runtime,
    rating: rating,
    genre: genre,
    imdb: this._parseImdb(movie),
    trailer: this._parseTrailer(movie),
    showtimes: showtimes.showtimes
  }
  if (showtimes.showtime_tickets) movieData.showtime_tickets = showtimes.showtime_tickets

  if (alternate && movieId) {
    movieData.director = director
    movieData.cast = cast
    movieData.description = description
  }

  return movieData
}

/**
 * Take in a "thing", can be either a movie or a theater object (if you are using alternate logic for a getMovies
 * lookup), and parse movie showtimes for it.
 * @param  {object} $    Raw Cheerio object from a cheerio.load() call, used to parse movies for the given
 *                        theater.
 * @param  {object} movie Cheerio object for either the movie of theater that you want to parse showtimes for.
 * @return {array}        Sorted and parsed array of movie showtimes.
 */
Showtimes.prototype._parseShowtimes = function ($, thing) {
  var meridiem = false
  var response = {}

  // Google displays showtimes like "10:00  11:20am  1:00  2:20  4:00  5:10  6:50  8:10  9:40  10:55pm". Since
  // they don't always apply am/pm to times, we need to run through the showtimes in reverse and then apply the
  // previous (later) meridiem to the next (earlier) movie showtime so we end up with something like
  // ["10:00am", "11:20am", "1:00pm", ...].

  var getTime = function (raw_time) {
    var showtime = this._removeNonAsciiCharacters(raw_time).trim()

    var match = showtime.match(/(am|pm)/)
    if (match) {
      meridiem = match[0]
    } else if (meridiem) {
      showtime += meridiem
    }

    return showtime
  }

  var target = thing.find('.times a.fl')
  var showtimes
  if (target.length === 0) {
    // No ticket urls available, process only showtimes
    showtimes = thing.find('.times').text().split(' ')
    response.showtimes = _.map(showtimes.reverse(), getTime.bind(this)).reverse()
  } else {
    // Ticket urls are available
    showtimes = target.map(function (i, el) {
      var tickets_url = url.parse($(el).attr('href'), true)

      return {
        time: $(el).text(),
        url: tickets_url.query.q
      }
    }).get()

    response.showtime_tickets = {}
    response.showtimes = _.map(showtimes.reverse(), function (item) {
      var time = getTime.bind(this)(item.time)
      response.showtime_tickets[time] = item.url
      return time
    }.bind(this)).reverse()
  }

  return response
}

/**
 * Parse movie information for a trailer URL.
 * @param  {object}       movie  Cheerio object for the movie that you want to parse.
 * @return {string|false}        Found trailer URL, or false if not.
 */
Showtimes.prototype._parseTrailer = function (movie) {
  if (movie.find('.info a:contains("Trailer")').length) {
    var cloakedUrl = 'https://google.com' + movie.find('.info a:contains("Trailer")').attr('href')

    return qs.parse(url.parse(cloakedUrl).query).q
  }

  return false
}

/**
 * Parse movie information for an IMDB URL.
 * @param  {object}       movie  Cheerio object for the movie that you want to parse.
 * @return {string|false}        Found IMDB URL, or false if not.
 */
Showtimes.prototype._parseImdb = function (movie) {
  if (movie.find('.info a:contains("IMDb")').length) {
    var cloakedUrl = 'https://google.com' + movie.find('.info a:contains("IMDb")').attr('href')

    return qs.parse(url.parse(cloakedUrl).query).q
  }

  return false
}

/**
 * Take in a mixed object (string or array) and return back a normalized string sans some non-ASCII characters that
 * cause problems (like some Turkish letters).
 * @param  {mixed} thing
 * @return {mixed}
 */
Showtimes.prototype._removeNonAsciiCharacters = function (thing) {
  if (typeof thing === 'object') {
    for (var x in thing) {
      thing[x] = thing[x].replace(/[^\x00-\x7F]/g, '')
    }

    return thing
  }

  return thing.replace(/[^\x00-\x7F]/g, '')
}

/**
 * Make a request to the API endpoint.
 * @param  {object}   params  Parameters to send along in the query string.
 * @param  {Function} cb      Callback function to run for the API after processing a request.
 * @param  {Function} handler Callback function to handle a request and generate an object of data.
 * @return {void}
 */
Showtimes.prototype._request = function (params, cb, handler) {
  var query = {
    hl: this.lang,
    near: this.location,
    date: this.date,
    start: ((this.page - 1) * 10)
  }

  for (var i in params) {
    query[i] = params[i]
  }

  var options = {
    url: this.baseUrl,
    qs: query,
    headers: {
      'User-Agent': this.userAgent,
      'gzip': true
    },
    encoding: 'binary'
  }

  request(options, function (error, response, body) {
    if (error || response.statusCode !== 200) {
      if (error === null) {
        cb('Unknown error occured while querying theater data from Google Movies.')
      } else {
        cb(error)
      }

      return
    }

    handler(body)
  })
}

module.exports = Showtimes
