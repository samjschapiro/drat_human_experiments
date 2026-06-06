import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({ region: process.env.AWS_REGION });
const BUCKET_NAME = process.env.BUCKET_NAME;
const EXPERIMENT_NAME = process.env.EXPERIMENT_NAME;

export const handler = async (event) => {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "OPTIONS,POST"
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const data = JSON.parse(event.body);

        if (!data.participant_id) {
            throw new Error('Missing required field: participant_id');
        }

        const timestamp = new Date().toISOString();
        const participantId = data.participant_id.replace(/[^a-zA-Z0-9_-]/g, '');
        const filename = `${timestamp.slice(0,19).replace(/[:\-]/g, '')}_${participantId}.json`;

        const enrichedData = {
            ...data,
            server_metadata: {
                submission_timestamp: timestamp,
                filename: filename,
                experiment_name: EXPERIMENT_NAME,
                source_ip: event.requestContext?.identity?.sourceIp,
                user_agent: event.headers?.['User-Agent']
            }
        };

        await s3Client.send(new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: `${EXPERIMENT_NAME}/${filename}`,
            Body: JSON.stringify(enrichedData, null, 2),
            ContentType: 'application/json'
        }));

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ status: 'success', filename })
        };

    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ status: 'error', message: error.message })
        };
    }
};
