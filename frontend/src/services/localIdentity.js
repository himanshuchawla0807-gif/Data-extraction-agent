const LOCAL_USER_ID_KEY = 'data_extraction_local_user_id';
const LOCAL_MODE_KEY = 'data_extraction_local_mode';

const createLocalUserId = () => {
  const randomPart =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `local_${randomPart}`;
};

export function getLocalIdentity() {
  let userId = localStorage.getItem(LOCAL_USER_ID_KEY);
  if (!userId) {
    userId = createLocalUserId();
    localStorage.setItem(LOCAL_USER_ID_KEY, userId);
  }
  localStorage.setItem(LOCAL_MODE_KEY, 'true');
  return {
    mode: 'local',
    userId,
  };
}

export function clearLocalIdentity() {
  localStorage.removeItem(LOCAL_USER_ID_KEY);
  localStorage.removeItem(LOCAL_MODE_KEY);
}
