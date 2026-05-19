module.exports = {
  apps: [
    {
      name: 'xiiina-sdr',
      script: './dist/server.js',
      cwd: '/Users/xiiina.com/Projects/MIURA/sdr-up-importadora',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production'
      },
      time: true,
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      min_uptime: 5000,
      max_restarts: 10,
    },
  ],
};
