import { redirect } from 'next/navigation';

/**
 * Compatibility route for bookmarks and older email links. Foundation Setup
 * now has one canonical experience at /onboarding.
 */
export default function WelcomeRedirect() {
  redirect('/onboarding');
}
