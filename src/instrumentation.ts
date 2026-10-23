import { type Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // The browser hanging up mid-render, from a cancelled prefetch or navigation, is not a fault.
  if (error instanceof Error && error.message.includes("destination stream closed early")) return;
  const { logError } = await import("@/lib/error-log");
  await logError(`server:${context.routeType}`, error, request.path);
};
