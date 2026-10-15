export function hasFullAccess(user) {
 return user?.privateMetadata?.learnerAccess === 'full';
}
