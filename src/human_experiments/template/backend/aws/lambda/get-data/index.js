import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({ region: process.env.AWS_REGION });
const BUCKET_NAME = process.env.BUCKET_NAME;
const EXPERIMENT_NAME = process.env.EXPERIMENT_NAME;

export const handler = async (event) => {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "OPTIONS,GET"
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const listResult = await s3Client.send(new ListObjectsV2Command({
            Bucket: BUCKET_NAME,
            Prefix: `${EXPERIMENT_NAME}/`
        }));

        if (!listResult.Contents || listResult.Contents.length === 0) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ status: 'success', participants: 0, csv_data: [] })
            };
        }

        const allData = [];
        const participants = new Set();

        for (const object of listResult.Contents) {
            if (object.Key === `${EXPERIMENT_NAME}/`) continue;
            try {
                const objectData = await s3Client.send(new GetObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: object.Key
                }));
                const data = JSON.parse(await objectData.Body.transformToString());
                allData.push(data);
                participants.add(data.participant_id);
            } catch (e) {
                console.error(`Error parsing ${object.Key}:`, e);
            }
        }

        const csvData = allData.flatMap(data =>
            (data.ratings || []).map(rating => ({
                participant_id: data.participant_id,
                ...rating,
                submission_timestamp: data.server_metadata?.submission_timestamp
            }))
        );

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                status: 'success',
                participants: participants.size,
                total_responses: csvData.length,
                csv_data: csvData,
                raw_data: allData
            })
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
