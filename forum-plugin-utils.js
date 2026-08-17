export const DSH_PLUGIN_TOPIC_API = "https://api.github.com/search/repositories?q=topic%3Adsh-plugin&sort=updated&order=desc&per_page=30";

export function normalizeForumPlugins(payload) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items.map((repo) => ({
    name: String(repo?.name || repo?.full_name || "未命名插件"),
    description: String(repo?.description || "暂无简介"),
    url: String(repo?.html_url || ""),
  })).filter((repo) => isGitHubRepositoryUrl(repo.url));
}

export function isGitHubRepositoryUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "github.com" && /^\/[^/]+\/[^/]+\/?$/.test(url.pathname);
  } catch {
    return false;
  }
}
