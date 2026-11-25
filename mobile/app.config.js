// Extends app.json with values that come from environment variables.
// GOOGLE_MAPS_API_KEY: Google Maps key for Android builds (APK). Locally it comes from mobile/.env;
// for EAS cloud builds it is an EAS environment variable (see PLAN.md, phase 7b).
// Expo Go doesn't need it.
export default ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins ?? []),
    ['react-native-maps', { androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY }],
  ],
});
