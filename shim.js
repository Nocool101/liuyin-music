global.Buffer = require('buffer').Buffer

if (typeof String.prototype.replaceAll !== 'function') {
  String.prototype.replaceAll = function (search, replace) {
    if (search instanceof RegExp) {
      if (!search.global) {
        throw new TypeError('replaceAll must be called with a global RegExp')
      }
      return this.replace(search, replace)
    }
    const str = String(search)
    if (str === '') {
      return this.split('').join(replace)
    }
    return this.split(str).join(replace)
  }
}

if (typeof Array.prototype.at !== 'function') {
  Array.prototype.at = function (index) {
    index = Math.trunc(index) || 0
    if (index < 0) index += this.length
    if (index < 0 || index >= this.length) return undefined
    return this[index]
  }
}

if (typeof String.prototype.at !== 'function') {
  String.prototype.at = function (index) {
    index = Math.trunc(index) || 0
    if (index < 0) index += this.length
    if (index < 0 || index >= this.length) return undefined
    return this.charAt(index)
  }
}
