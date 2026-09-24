import { createInterface } from "node:readline/promises";
import { emitKeypressEvents, moveCursor, cursorTo } from "node:readline";
import type { Key } from "node:readline";
import { ConsoleCancelled } from "./console-process.ts";

export interface ConsoleChoice {
  readonly value: string;
  readonly label: string;
}
export interface ConsoleUI {
  write(message: string): void;
  input(label: string, initial?: string): Promise<string>;
  select(label: string, choices: readonly ConsoleChoice[]): Promise<string>;
}

/** Terminal ownership stays at the binary edge; workflows accept a scripted UI in tests. */
export function terminalUI(plain: boolean): ConsoleUI {
  const input = process.stdin,
    output = process.stdout;
  const write = (message: string): void => {
    output.write(`${message}\n`);
  };
  async function ask(label: string, initial?: string): Promise<string> {
    const readline = createInterface({ input, output, terminal: true });
    const controller = new AbortController();
    const cancel = (): void => {
      controller.abort();
    };
    readline.once("SIGINT", cancel);
    readline.once("close", cancel);
    try {
      const answer = await readline.question(`${label}${initial ? ` [${initial}]` : ""}: `, {
        signal: controller.signal,
      });
      return answer.trim() || (initial ?? "");
    } catch (cause) {
      if (controller.signal.aborted) throw new ConsoleCancelled();
      throw cause;
    } finally {
      readline.close();
    }
  }
  return {
    write,
    input: ask,
    async select(label, choices) {
      write(`\n${label}`);
      if (plain) {
        choices.forEach((choice, index) => {
          write(`  ${index + 1}. ${choice.label}`);
        });
        while (true) {
          const answer = await ask("Choose a number", "1");
          const choice = /^\d+$/.test(answer) ? choices[Number(answer) - 1] : undefined;
          if (choice) return choice.value;
          write(`Choose 1–${choices.length}. Ctrl+C exits.`);
        }
      }
      return await new Promise<string>((resolve, reject) => {
        let selected = 0;
        const render = (): void => {
          choices.forEach((choice, index) => {
            write(`${index === selected ? "›" : " "} ${index + 1}. ${choice.label}`);
          });
          write("↑/↓ or number · Enter selects · Esc goes back · Ctrl+C exits");
        };
        const wasRaw = input.isRaw;
        const finish = (value?: string): void => {
          input.off("keypress", keypress);
          input.off("end", end);
          input.setRawMode(wasRaw);
          input.pause();
          if (value === undefined) reject(new ConsoleCancelled());
          else resolve(value);
        };
        const end = (): void => {
          finish();
        };
        const keypress = (text: string, key: Key): void => {
          if ((key.ctrl && key.name === "c") || (key.ctrl && key.name === "d")) {
            finish();
            return;
          }
          if (key.name === "escape") {
            finish(
              choices.find((choice) => choice.value === "back" || choice.value === "exit")?.value,
            );
            return;
          }
          if (key.name === "return") {
            finish(choices[selected]?.value);
            return;
          }
          if (key.name === "up") selected = (selected + choices.length - 1) % choices.length;
          else if (key.name === "down") selected = (selected + 1) % choices.length;
          else if (/^[1-9]$/.test(text) && Number(text) <= choices.length)
            selected = Number(text) - 1;
          else return;
          moveCursor(output, 0, -(choices.length + 1));
          cursorTo(output, 0);
          render();
        };
        emitKeypressEvents(input);
        input.setRawMode(true);
        input.on("keypress", keypress);
        input.once("end", end);
        render();
        input.resume();
      });
    },
  };
}
