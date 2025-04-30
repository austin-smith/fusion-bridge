console.log(`[findEventsInWindow] Entered function body. Filter:`, JSON.stringify(filter)); // Log entry before try
try {
    // --- Convert to SECONDS for comparison with DB --- 
    const startTimeSeconds = Math.floor(filter.startTime.getTime() / 1000);
    const endTimeSeconds = Math.ceil(filter.endTime.getTime() / 1000);
    console.log(`[findEventsInWindow] Querying between ${startTimeSeconds} and ${endTimeSeconds} (Unix Seconds)`);

    const baseConditions: SQL[] = [
        // ... existing code ...
    ];
    
    console.log(`[findEventsInWindow] About to execute query WITH join...`); // Log before query
    // Query WITH JOIN to filter by device properties
    dbResults = await db
        .orderBy(desc(events.timestamp)); // Order by timestamp might be useful

} else {
    console.log(`[findEventsInWindow] About to execute query WITHOUT join...`); // Log before query
    // Query WITHOUT JOIN if no standardizedDeviceType filter needed
    // Restore join with connectors and original selectFields
    // ... existing code ...
    minimalTemporalFacts[path] = (value === undefined ? null : value);
});
console.log(`[evaluateTemporalCondition] Evaluating event filter for event ${event.eventId} with MINIMAL facts:`, minimalTemporalFacts); // Log minimal facts
// --- End flatten --- 

try {
    // ... existing code ...
} catch (error) {
    // ... existing code ...
} 