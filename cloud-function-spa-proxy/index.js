/**
 * Cloud Function to proxy requests to Cloud Storage bucket
 * and rewrite all paths to index.html for React Router SPA support
 */
const {Storage} = require('@google-cloud/storage');
const storage = new Storage();

const BUCKET_NAME = process.env.BUCKET_NAME || 'neon-circle-466008-p0-remote-tv-frontend';

exports.spaProxy = async (req, res) => {
    // Get the path from the request
    let path = req.path || '/';
    
    // Remove leading slash
    if (path.startsWith('/')) {
        path = path.substring(1);
    }
    
    // Get the bucket
    const bucket = storage.bucket(BUCKET_NAME);
    
    try {
        // Try to get the file
        let file = bucket.file(path);
        
        // Check if file exists and is not a directory
        const [exists] = await file.exists();
        
        if (exists && path !== '' && !path.endsWith('/')) {
            // File exists, serve it
            const [metadata] = await file.getMetadata();
            const contentType = metadata.contentType || 'application/octet-stream';
            
            // Set appropriate headers
            res.set('Content-Type', contentType);
            res.set('Cache-Control', 'public, max-age=3600');
            
            // Stream the file
            file.createReadStream().pipe(res);
        } else {
            // File doesn't exist or is a directory, serve index.html for SPA routing
            const indexFile = bucket.file('index.html');
            const [indexExists] = await indexFile.exists();
            
            if (indexExists) {
                res.set('Content-Type', 'text/html');
                res.set('Cache-Control', 'public, max-age=0'); // Don't cache index.html
                indexFile.createReadStream().pipe(res);
            } else {
                res.status(404).send('index.html not found');
            }
        }
    } catch (error) {
        console.error('Error serving file:', error);
        // On error, try to serve index.html
        try {
            const indexFile = bucket.file('index.html');
            res.set('Content-Type', 'text/html');
            indexFile.createReadStream().pipe(res);
        } catch (indexError) {
            res.status(500).send('Internal Server Error');
        }
    }
};
