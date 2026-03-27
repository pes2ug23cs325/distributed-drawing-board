class StrokeLog {
  constructor() {
    this.entries = [];
  }

  append(entry) {
    const index = this.entries.length;
    this.entries.push({ ...entry, index });
    return index;
  }

  getFrom(fromIndex) {
    return this.entries.slice(fromIndex);
  }

  getAll() {
    return this.entries;
  }

  getLength() {
    return this.entries.length;
  }
}

module.exports = StrokeLog;