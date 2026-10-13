import { createBrowserRouter } from "react-router";

export function createAiroBrowserRouter(
  routes: Parameters<typeof createBrowserRouter>[0],
  opts?: Parameters<typeof createBrowserRouter>[1]
) {
  return createBrowserRouter(routes, opts);
}