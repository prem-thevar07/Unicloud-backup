// Retrieve activities from localStorage
export const getSessionActivities = () => {
  try {
    const raw = localStorage.getItem("unicloud:activities");
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
};

// Save activities to localStorage
export const saveSessionActivities = (list) => {
  try {
    localStorage.setItem("unicloud:activities", JSON.stringify(list.slice(0, 50)));
  } catch (e) {}
};

// Log a real user transaction
export const logActivity = (text, icon = "⚡", colorClass = "blue") => {
  const current = getSessionActivities();
  const newActivity = {
    id: `act-${Date.now()}-${Math.random()}`,
    text,
    icon,
    colorClass,
    date: new Date().toISOString()
  };
  saveSessionActivities([newActivity, ...current]);
};
