const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

const s3 = new S3Client({ region: process.env.AWS_REGION });
const BUCKET = process.env.DATA_BUCKET;
const SLOTS_KEY = 'slot_assignments.json';
const TOTAL_SLOTS = 40;

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        // Get participant ID from query string or body
        let participantId;
        if (event.queryStringParameters?.PROLIFIC_PID) {
            participantId = event.queryStringParameters.PROLIFIC_PID;
        } else if (event.body) {
            const body = JSON.parse(event.body);
            participantId = body.participant_id;
        }

        if (!participantId) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'participant_id required' })
            };
        }

        // Load current slot assignments
        let assignments = { slots: {}, counter: 0 };
        try {
            const response = await s3.send(new GetObjectCommand({
                Bucket: BUCKET,
                Key: SLOTS_KEY
            }));
            const content = await response.Body.transformToString();
            assignments = JSON.parse(content);
        } catch (err) {
            if (err.name !== 'NoSuchKey') {
                console.error('Error reading assignments:', err);
            }
            // File doesn't exist yet, use defaults
        }

        // Check if participant already has a slot (idempotent)
        if (assignments.slots[participantId] !== undefined) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    slot: assignments.slots[participantId],
                    total_slots: TOTAL_SLOTS,
                    status: 'existing'
                })
            };
        }

        // Assign next slot
        const slot = assignments.counter % TOTAL_SLOTS;
        assignments.slots[participantId] = slot;
        assignments.counter += 1;

        // Save updated assignments
        await s3.send(new PutObjectCommand({
            Bucket: BUCKET,
            Key: SLOTS_KEY,
            Body: JSON.stringify(assignments, null, 2),
            ContentType: 'application/json'
        }));

        console.log(`Assigned slot ${slot} to participant ${participantId} (counter: ${assignments.counter})`);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                slot: slot,
                total_slots: TOTAL_SLOTS,
                status: 'assigned',
                participants_so_far: assignments.counter
            })
        };

    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};
