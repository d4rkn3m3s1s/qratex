import { permanentRedirect } from 'next/navigation';

/** /dealer/automation → ilk bölüm. */
export default function AutomationIndexPage() {
  permanentRedirect('/dealer/automation/replies');
}
