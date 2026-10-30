import { PageSkeleton } from "@/components/common/page-skeletons";

/** Shown instantly while any page of the app renders on the server. */
export default function Loading() {
  return <PageSkeleton />;
}
