import { RouterProvider } from "react-router";

export function AiroRouterProvider(
  props: React.ComponentProps<typeof RouterProvider>
) {
  return <RouterProvider {...props} />;
}