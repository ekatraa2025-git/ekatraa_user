# EAS Build – Fix "Entity not authorized" and build APK

## 1. Use `npx` for all EAS commands

Always run:
```bash
npx eas-cli <command>
```
Example: `npx eas-cli whoami`, `npx eas-cli login`, `npx eas-cli build ...`

---

## 2. Fix the permission error

The app is linked to an EAS project your current Expo account cannot access.

### Option A – Log in with the account that owns the project

If you have the Expo account that created this project:

```bash
cd /Users/ZantrikTechnologies/Desktop/Others/ekatraa
npx eas-cli whoami
npx eas-cli login
```

Sign in with that account, then run the build again.

### Option B – Create a new EAS project under your account (recommended if you don’t have access)

This creates a new project and updates `app.json` with the new `projectId`:

```bash
cd /Users/ZantrikTechnologies/Desktop/Others/ekatraa
npx eas-cli login
npx eas-cli init
```

When asked "Would you like to create a new project?", choose **Yes**.  
Then build:

```bash
npx eas-cli build --platform android --profile production
```

---

## 3. Build production APK (after fixing login)

From the project root:

```bash
cd /Users/ZantrikTechnologies/Desktop/Others/ekatraa
npx eas-cli build --platform android --profile production
```

Your `eas.json` already has `production` with `buildType: "apk"`, so this will produce an APK.

---

## 4. Optional: silence Expo Go warning

To hide the "Expo Go for development" warning during the build:

```bash
EAS_BUILD_NO_EXPO_GO_WARNING=true npx eas-cli build --platform android --profile production
```

Or add to `.env`: `EAS_BUILD_NO_EXPO_GO_WARNING=true`

---

## 5. Optional: set `cli.appVersionSource`

Expo recommends setting this. Add to `eas.json` under `"cli"`:

```json
"cli": {
    "version": ">= 3.0.0",
    "appVersionSource": "local"
}
```

Then version is read from `app.json` → `expo.version` (currently `"1.0.0"`).
