module.exports = {
  /**
   * Application configuration section
   * http://pm2.keymetrics.io/docs/usage/application-declaration/
   */
  apps : [

    // melda-file-manager main
    { 
      name: "melda-file",
      script: "index.js",
      watch: false,
      ignore_watch: [
        ".gitignore",
        ".git",
        "node_modules",
        "users"
      ], },

  ]
}
