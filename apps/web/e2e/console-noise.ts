/**
 * The one console message the browser tests do not count as a problem.
 *
 * Chrome's software GL (SwiftShader, used where there is no GPU, such as a CI runner) reports this driver
 * performance note for any WebGL canvas that is shown, including a bare page with one canvas and no application
 * code. It comes from the browser's GPU process, not from anything the page does. Every other warning and every
 * error still fails the test.
 */
const SOFTWARE_GL_NOTE =
  /^\[\.WebGL-0x[0-9a-f]+\]GL Driver Message \(OpenGL, Performance, GL_CLOSE_PATH_NV, High\): GPU stall due to ReadPixels( \(this message will no longer repeat\))?$/;

export function isSoftwareGlNote(message: { type: string; text: string }): boolean {
  return message.type === "warning" && SOFTWARE_GL_NOTE.test(message.text);
}
