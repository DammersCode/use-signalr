import { session } from "./provider";

let logins = 0;

export function signIn(userId: string, token: string) {
  logins += 1;
  session.update({
    accessTokenFactory: () => token,
    connectionKey: `${userId}:${logins}`,
  });
}
