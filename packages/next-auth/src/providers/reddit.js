/** @type {import(".").OAuthProvider} */
export default function Reddit(options) {
  return {
    id: "reddit",
    name: "Reddit",
    type: "oauth",
    authorization: "https://www.reddit.com/api/v1/authorize?scope=identity",
    token: " https://www.reddit.com/api/v1/access_token",
    userinfo: "https://oauth.reddit.com/api/v1/me",
    profile(profile) {
      return {
        id: profile.id,
        name: profile.name,
        email: null,
        image: null,
      }
    },
    style: {
      logo: "/reddit.svg",
      bg: "#fff",
      text: "#000",
      logoDark: "/reddit.svg",
      bgDark: "#000",
      textDark: "#fff",
    },
    options,
  }
}
