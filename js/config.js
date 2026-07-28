// Configuração Google reaproveitada da versão estável do Borion.
// O Client ID OAuth de aplicações Web é público e precisa estar presente no frontend.
const KeyronConfig = Object.freeze({
  GOOGLE_CLIENT_ID: '946105310952-gp143h81mm3704lrq3877hsie49njgak.apps.googleusercontent.com',
  APP_VERSION: '1.0.0',
  REQUIRE_GOOGLE_EACH_SESSION: true,
  MAX_LOGO_BYTES: 4 * 1024 * 1024,
  MAX_LOGO_SIDE: 8192,
  MAX_LOGO_PIXELS: 24 * 1024 * 1024,
  MAX_BUNDLE_BYTES: 96 * 1024 * 1024,
  MAX_CSV_BYTES: 8 * 1024 * 1024,
  MAX_CSV_ROWS: 10000,
  HIDDEN_LOCK_SECONDS: 30,
  MAX_DRIVE_BACKUPS: 10,
  AUTO_SNAPSHOT_HOURS: 12
});
