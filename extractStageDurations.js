const msToReadable = require("./msToReadable"); // e.g., 125000 → "2 min 5 sec"

function extractStageDurations(vehicles) {
  const durations = {
    interactiveBay: [],
    jobCard: [],
    additionalWork: [],
    bayWork: [],
    parts: [],
    washing: [],
    finalInspection: [],
  };

  vehicles.forEach((v) => {
    // Interactive Bay
    if (v.interactiveBay?.start && v.interactiveBay?.end) {
      const dur = new Date(v.interactiveBay.end) - new Date(v.interactiveBay.start);
      durations.interactiveBay.push(dur);
    }

    // Job Card
    if (v.jobCard?.createdAt && v.jobCard?.customerApproval?.approvedAt) {
      const dur = new Date(v.jobCard.customerApproval.approvedAt) - new Date(v.jobCard.createdAt);
      durations.jobCard.push(dur);
    }

    // Additional Work
    if (Array.isArray(v.additionalWork)) {
      v.additionalWork.forEach((aw) => {
        if (aw.requestedAt && aw.allocatedAt) {
          const dur = new Date(aw.allocatedAt) - new Date(aw.requestedAt);
          durations.additionalWork.push(dur);
        }
      });
    }

    // Bay Work
    if (Array.isArray(v.bayWork)) {
      let totalBayMs = 0;
      v.bayWork.forEach((bw) => {
        if (Array.isArray(bw.sessions)) {
          bw.sessions.forEach((session) => {
            if (session.start && session.end) {
              totalBayMs += new Date(session.end) - new Date(session.start);
            }
          });
        }
      });
      if (totalBayMs > 0) durations.bayWork.push(totalBayMs);
    }

    // Parts
    if (v.partsEstimate?.start && v.partsEstimate?.end) {
      const dur = new Date(v.partsEstimate.end) - new Date(v.partsEstimate.start);
      durations.parts.push(dur);
    }

    // Washing
    if (v.washing?.start && v.washing?.end) {
      const dur = new Date(v.washing.end) - new Date(v.washing.start);
      durations.washing.push(dur);
    }

    // Final Inspection
    if (v.finalInspection?.start && v.finalInspection?.end) {
      const dur = new Date(v.finalInspection.end) - new Date(v.finalInspection.start);
      durations.finalInspection.push(dur);
    }
  });

  const getAverage = (arr) => {
    if (!arr.length) return null;
    const total = arr.reduce((sum, v) => sum + v, 0);
    const avg = total / arr.length;
    return { ms: avg, readable: msToReadable(avg) };
  };

  return {
    averageDurations: {
      interactiveBay: getAverage(durations.interactiveBay),
      jobCard: getAverage(durations.jobCard),
      additionalWork: getAverage(durations.additionalWork),
      bayWork: getAverage(durations.bayWork),
      parts: getAverage(durations.parts),
      washing: getAverage(durations.washing),
      finalInspection: getAverage(durations.finalInspection),
    },
    rawDurations: durations,
  };
}

module.exports = extractStageDurations;
