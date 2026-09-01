module.exports = {
  apps: [
    {
      name: 'studyroom-api',
      script: 'server.js',
      cwd: __dirname,
      watch: false,
      autorestart: true,
      restart_delay: 2000,
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      exp_backoff_restart_delay: 1000
    }
  ]
};
