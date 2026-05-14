/**
 * Heurística para detectar si el último mensaje del agente es una solicitud de
 * login manual. Se usa al final de cada turn.
 *
 * El agente, cuando ve que la página requiere autenticación (Salesforce sandbox,
 * SSO, MFA), genera un texto pidiendo al humano que se loguee. No hay un signal
 * formal en el SDK para esto; se detecta por el contenido del mensaje.
 *
 * Vamos por sobre-cobertura: preferimos pausar de más (peor caso: el QA aprieta
 * "continuar" sin haber hecho nada → el agente reintenta) que de menos (peor
 * caso: el agente queda intentando interactuar con login screen y reporta fail).
 *
 * Si en producción esta heurística da muchos falsos positivos, se puede pedir
 * al agente en el prompt que use un marcador explícito como `[NEEDS_LOGIN]`
 * y aquí solo chequeamos esa string.
 */

const LOGIN_KEYWORDS_ES = [
  "necesito que te loguees",
  "necesito que inicies sesión",
  "por favor logueate",
  "por favor inicia sesión",
  "logueate manualmente",
  "inicia sesión manualmente",
  "necesito tu login",
  "requiere login",
  "requiere autenticación",
  "credenciales",
  "esperando login",
];

const LOGIN_KEYWORDS_EN = [
  "please log in",
  "please login",
  "log in manually",
  "login manually",
  "needs login",
  "needs authentication",
  "requires login",
  "requires authentication",
  "waiting for login",
  "i need you to log in",
  "manual login required",
];

const ALL_KEYWORDS = [...LOGIN_KEYWORDS_ES, ...LOGIN_KEYWORDS_EN];

export function needsLogin(finalText: string): boolean {
  if (!finalText) return false;
  const lower = finalText.toLowerCase();
  return ALL_KEYWORDS.some((kw) => lower.includes(kw));
}
