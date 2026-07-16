const path = require("node:path");

const { app, BrowserWindow, shell } = require("electron");
const {
  registerMediaIpc,
  registerMediaProtocol,
  registerMediaScheme,
} = require("./media.cjs");

const DEV_SERVER_URL = "http://127.0.0.1:5173";
const WINDOW_BACKGROUND_COLOR = "#09090b";

let mainWindow = null;

registerMediaScheme();

function isExternalUrl(url) {
  return url.startsWith("http://") || url.startsWith("https://");
}

function openExternalUrl(url) {
  if (!isExternalUrl(url)) return;
  void shell.openExternal(url);
}

function configureNavigation(window) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    const isDevelopmentNavigation = !app.isPackaged && url.startsWith(DEV_SERVER_URL);
    const isPackagedNavigation = app.isPackaged && url.startsWith("file://");

    if (isDevelopmentNavigation || isPackagedNavigation) return;
    event.preventDefault();
    openExternalUrl(url);
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: WINDOW_BACKGROUND_COLOR,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  configureNavigation(mainWindow);
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  if (app.isPackaged) {
    void mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
    return;
  }

  void mainWindow.loadURL(DEV_SERVER_URL);
}

app.setAppUserModelId("com.v4lgrind.jellyfinclient");

app.whenReady().then(() => {
  registerMediaIpc();
  registerMediaProtocol();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
