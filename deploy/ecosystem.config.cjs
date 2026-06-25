module.exports = {
  apps: [
    {
      name: "nijvox",
      script: "./dist/index.cjs",
      cwd: "/var/www/html/nijvox",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PORT: 5000,
      },
      env_file: "/var/www/html/nijvox/.env",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "/var/log/nijvox/error.log",
      out_file: "/var/log/nijvox/out.log",
      merge_logs: true,
    },
  ],
};
