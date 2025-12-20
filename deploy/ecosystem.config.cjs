module.exports = {
  apps: [
    {
      name: "nijvox-backend",
      script: "./dist/index.cjs",
      cwd: "/var/www/html/aiagent",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PORT: 6331,
      },
      env_file: ".env",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "/var/log/nijvox/error.log",
      out_file: "/var/log/nijvox/out.log",
      merge_logs: true,
    },
  ],
};
