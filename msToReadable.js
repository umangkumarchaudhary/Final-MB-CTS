function msToReadable(ms) {
    if (typeof ms !== 'number' || isNaN(ms)) return 'N/A';
  
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const hrs = Math.floor(mins / 60);
    const days = Math.floor(hrs / 24);
  
    const s = seconds % 60;
    const m = mins % 60;
    const h = hrs % 24;
    const d = days;
  
    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    if (s > 0 || parts.length === 0) parts.push(`${s}s`);
  
    return parts.join(' ');
  }
  
  module.exports = msToReadable;
  