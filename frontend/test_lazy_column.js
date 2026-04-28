
// Browser Console Test Script
// Run this in the DevTools Console to verify the fix.

async function testLazyColumnCreation() {
    console.clear();
    console.log("🚀 Starting Lazy Column Creation Test...");

    // 1. Define a NEW column name that definitely doesn't exist
    const testColName = "Lazy Revenue " + Date.now();
    const testValue = "$1,000,000";

    console.log(`Step 1: Simulating streamRowData for non-existent column: "${testColName}"`);
    console.log("NOTE: We are NOT sending a create_column message first. This tests the lazy creation logic.");

    // 2. Simulate the Event
    // We strictly use the event format that useExtractionWebSocket expects
    const eventData = {
        type: 'streamRowData',
        data: {
            column_name: testColName,
            extracted_value: testValue,
            row_index: 0, // Target first row
            file_name: "Test File.pdf",
            is_placeholder: false
        }
    };

    // Emit the event directly via the exposed service
    if (window.websocketService) {
        window.websocketService.emit('streamRowData', eventData);
    } else {
        console.error("❌ window.websocketService is not defined. Did you modify App.jsx?");
        return;
    }

    // 3. Wait for React to Render
    console.log("⏳ Waiting for React to update...");
    await new Promise(r => setTimeout(r, 1000));

    // 4. Verify DOM
    // Look for the column header
    const headers = Array.from(document.querySelectorAll('th, .th')); // Adjust selector based on actual table implementation
    const foundHeader = headers.find(h => h.textContent.includes(testColName));

    if (foundHeader) {
        console.log(`✅ SUCCESS: Column "${testColName}" was created!`);
    } else {
        console.error(`❌ FAILURE: Column "${testColName}" was NOT found in headers.`);
    }

    // Look for the value
    // This is harder to pinpoint without specific row IDs, but we can search body
    const bodyText = document.body.innerText;
    if (bodyText.includes(testValue)) {
        console.log(`✅ SUCCESS: Value "${testValue}" is rendered in the table!`);
    } else {
        console.error(`❌ FAILURE: Value "${testValue}" was NOT found in the table.`);
    }

}

testLazyColumnCreation();
