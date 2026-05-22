export function createAuthClient({ refreshToken }) {
  let accessToken = "expired";

  return {
    async request(path) {
      if (accessToken === "expired") {
        accessToken = await refreshToken();
      }

      return {
        path,
        authorization: `Bearer ${accessToken}`
      };
    },

    expire() {
      accessToken = "expired";
    }
  };
}

