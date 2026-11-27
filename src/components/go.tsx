import { type Href, useRouter } from 'expo-router';
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { Pressable } from 'react-native';

type Props = {
  href: Href;
  /** The child is the pressable thing itself (it gets the press). */
  asChild?: boolean;
  /** Goes back to that page instead of opening it again on top. */
  dismissTo?: boolean;
  onPress?: () => void;
  children: ReactNode;
};

/**
 * Opens another page of the app. Used instead of the router's own link: on the
 * website that one loaded the whole app again on every press, which made
 * moving between pages slow.
 */
export function Link({ href, asChild, dismissTo, onPress, children }: Props) {
  const router = useRouter();
  const go = (event?: { preventDefault?: () => void }) => {
    event?.preventDefault?.();
    onPress?.();
    if (dismissTo) router.dismissTo(href);
    else router.push(href);
  };
  if (asChild && isValidElement(children)) {
    return cloneElement(children as ReactElement<{ onPress?: typeof go }>, { onPress: go });
  }
  return (
    <Pressable accessibilityRole="link" onPress={go}>
      {children}
    </Pressable>
  );
}
