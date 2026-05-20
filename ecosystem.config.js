module.exports = {
  apps: [{
    name: 'rage-studios',
    script: 'dist/rage-studios/server/server.mjs',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 4000
    }
  }]
};
