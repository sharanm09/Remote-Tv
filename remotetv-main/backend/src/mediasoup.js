const mediasoup = require('mediasoup');
const config = require('./config');

let worker;
let router;

async function createWorker() {
  worker = await mediasoup.createWorker({
    rtcMinPort: config.mediasoup.worker.rtcMinPort,
    rtcMaxPort: config.mediasoup.worker.rtcMaxPort,
    logLevel: config.mediasoup.worker.logLevel,
    logTags: config.mediasoup.worker.logTags,
  });

  console.log(`mediasoup worker created [pid:${worker.pid}]`);

  worker.on('died', (error) => {
    console.error('mediasoup worker died', error);
    setTimeout(() => process.exit(1), 2000);
  });

  return worker;
}

async function createRouter() {
  const mediaCodecs = config.mediasoup.router.mediaCodecs;
  router = await worker.createRouter({ mediaCodecs });
  console.log('mediasoup router created');
  return router;
}

async function createWebRtcTransport() {
  const transport = await router.createWebRtcTransport(
    config.mediasoup.webRtcTransport
  );

  console.log(`WebRtcTransport created [id:${transport.id}]`);

  transport.on('dtlsstatechange', (dtlsState) => {
    if (dtlsState === 'closed') {
      console.log('Transport closed');
      transport.close();
    }
  });

  transport.on('close', () => {
    console.log('Transport closed');
  });

  return transport;
}

module.exports = {
  createWorker,
  createRouter,
  createWebRtcTransport,
  getRouter: () => router,
};

