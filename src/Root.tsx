import App from './App';
import { SettingsWindow } from './components/SettingsWindow';

//two tauri windows point at this same bundle == the small popover ("main")
//and the settings window, distinguished bu a query param set when the 
//settings window is created (see open_settings_window in lib.rs).
export default function Root() {
    const isSettings = new URLSearchParams(window.location.search).has("settings");
    return isSettings ? <SettingsWindow /> : <App />;
}