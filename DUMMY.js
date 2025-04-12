router.get("/dashboard/live-status", authMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const activeVehicles = await Vehicle.find({ exitTime: null });

    const todayVehicles = await Vehicle.find({
      entryTime: { $gte: startOfToday }
    });

    const stageMap = {};

    for (const vehicle of activeVehicles) {
      const { vehicleNumber, stages } = vehicle;

      const stageGroups = {};

      // Group stages by stageName
      for (const stage of stages) {
        if (!stageGroups[stage.stageName]) {
          stageGroups[stage.stageName] = [];
        }
        stageGroups[stage.stageName].push(stage);
      }

      // Process each stage group
      for (const [stageName, entries] of Object.entries(stageGroups)) {
        const starts = entries
          .filter(s => s.eventType === "Start")
          .sort((a, b) => a.timestamp - b.timestamp);
        const ends = entries
          .filter(s => s.eventType === "End")
          .sort((a, b) => a.timestamp - b.timestamp);

        for (const start of starts) {
          const isEnded = ends.some(end => end.timestamp > start.timestamp);
          if (!isEnded) {
            if (!stageMap[stageName]) stageMap[stageName] = [];

            stageMap[stageName].push({
              vehicleNumber,
              startedAt: start.timestamp,
              performedBy: start.performedBy?.userName || "Unknown"
            });

            break; // Avoid duplicate active stages per vehicle per stageName
          }
        }
      }
    }

    res.status(200).json({
      success: true,
      message: "Live status fetched successfully",
      data: {
        totalActiveVehicles: activeVehicles.length,
        todayEntries: todayVehicles.map(v => ({
          vehicleNumber: v.vehicleNumber,
          entryTime: v.entryTime
        })),
        liveStageStatus: stageMap
      }
    });

  } catch (error) {
    console.error("❌ Error in /dashboard/live-status:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
});