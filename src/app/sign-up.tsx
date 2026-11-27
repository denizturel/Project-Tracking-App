import { Redirect } from 'expo-router';

/** donevaapp.com/sign-up: the sign-in page with the new-account form open. */
export default function SignUp() {
  return <Redirect href="/sign-in?new=1" />;
}
