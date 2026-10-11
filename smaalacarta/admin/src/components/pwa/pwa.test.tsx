import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { browser, actions } = vi.hoisted(() => {
  class PushSetupError extends Error {
    constructor(public reason: string) {
      super(reason);
    }
  }

  return {
    browser: {
      PushSetupError,
      readEnvironment: vi.fn(),
      registerServiceWorker: vi.fn(),
      getSubscription: vi.fn(),
      subscribeDevice: vi.fn(),
      unsubscribeDevice: vi.fn(),
    },
    actions: {
      savePushSubscriptionAction: vi.fn(),
      deletePushSubscriptionAction: vi.fn(),
      hasPushSubscriptionAction: vi.fn(),
    },
  };
});

vi.mock("./browser", () => browser);
vi.mock("./actions", () => actions);

import InstallAppButton from "./InstallAppButton";
import PushToggle from "./PushToggle";
import { resetForTests } from "./pwa-store";
import ServiceWorkerRegister from "./ServiceWorkerRegister";

// Los botones solo pintan: qué mostrar lo decide `src/lib/push/install.ts` (con su propio test). Acá se
// comprueba el cableado: toques, permisos y que ambos botones compartan estado.
const ENV = {
  isIOS: false,
  standalone: false,
  hasServiceWorker: true,
  hasPushManager: true,
  permission: "default",
};

const SUBSCRIPTION = { endpoint: "https://push.example/1", keys: { p256dh: "p", auth: "a" } };

function setEnv(extra: Partial<typeof ENV> = {}) {
  browser.readEnvironment.mockReturnValue({ ...ENV, ...extra });
}

// Deja que se resuelvan el registro del service worker y la primera lectura de la suscripción.
const settle = () => act(async () => {});

function mount(ui: React.ReactElement = <ServiceWorkerRegister />) {
  return render(ui);
}

beforeEach(() => {
  resetForTests();
  vi.clearAllMocks();
  setEnv();
  browser.registerServiceWorker.mockResolvedValue(undefined);
  browser.getSubscription.mockResolvedValue(null);
  browser.subscribeDevice.mockResolvedValue(SUBSCRIPTION);
  browser.unsubscribeDevice.mockResolvedValue(SUBSCRIPTION.endpoint);
  actions.savePushSubscriptionAction.mockResolvedValue({ ok: true });
  actions.deletePushSubscriptionAction.mockResolvedValue({ ok: true });
  actions.hasPushSubscriptionAction.mockResolvedValue(true);
});

afterEach(() => {
  resetForTests();
});

describe("Activar avisos — ADMIN-PWA-13 y 14", () => {
  it("se ve si el aparato puede y no está suscripto; al tocar pide el permiso y guarda la suscripción", async () => {
    mount(<PushToggle />);
    await settle();

    const button = await screen.findByRole("button", { name: /Activar avisos/ });
    // Nada de pedir el permiso solo: hasta el toque no se llamó.
    expect(browser.subscribeDevice).not.toHaveBeenCalled();

    // Después de activar, la lectura siguiente ya lo encuentra suscripto.
    browser.getSubscription.mockResolvedValue({ endpoint: SUBSCRIPTION.endpoint });
    setEnv({ permission: "granted" });
    fireEvent.click(button);

    await waitFor(() => expect(actions.savePushSubscriptionAction).toHaveBeenCalledWith(SUBSCRIPTION));
    expect(browser.subscribeDevice).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Avisos activados")).toBeInTheDocument();
  });

  it("suscripto muestra 'Avisos activados' y permite desactivar", async () => {
    setEnv({ permission: "granted" });
    browser.getSubscription.mockResolvedValue({ endpoint: SUBSCRIPTION.endpoint });

    mount(<PushToggle />);
    expect(await screen.findByText("Avisos activados")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Desactivar avisos" }));

    await waitFor(() => expect(actions.deletePushSubscriptionAction).toHaveBeenCalledWith(SUBSCRIPTION.endpoint));
    expect(browser.unsubscribeDevice).toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: /Activar avisos/ })).toBeInTheDocument();
  });

  it("si el navegador sigue suscripto de otra cuenta, ofrece activar de nuevo (ADMIN-PWA-28)", async () => {
    setEnv({ permission: "granted" });
    browser.getSubscription.mockResolvedValue({ endpoint: SUBSCRIPTION.endpoint });
    actions.hasPushSubscriptionAction.mockResolvedValue(false);

    mount(<PushToggle />);

    expect(await screen.findByRole("button", { name: /Activar avisos/ })).toBeInTheDocument();
    expect(screen.queryByText("Avisos activados")).not.toBeInTheDocument();
  });

  it("con el permiso bloqueado lo dice", async () => {
    setEnv({ permission: "denied" });

    mount(<PushToggle />);

    expect(
      await screen.findByText("Los avisos están bloqueados: habilitalos en los ajustes del navegador"),
    ).toBeInTheDocument();
  });

  it("en iPhone sin instalar pide instalar la app", async () => {
    setEnv({ isIOS: true, hasPushManager: false });

    mount(<PushToggle />);

    expect(await screen.findByText("Instalá la app para recibir avisos")).toBeInTheDocument();
  });

  it("si el permiso se rechaza, muestra por qué y no queda activado", async () => {
    browser.subscribeDevice.mockRejectedValue(new browser.PushSetupError("dismissed"));

    mount(<PushToggle />);
    fireEvent.click(await screen.findByRole("button", { name: /Activar avisos/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No diste el permiso");
    expect(actions.savePushSubscriptionAction).not.toHaveBeenCalled();
  });

  it("sin service worker no se muestra", async () => {
    setEnv({ hasServiceWorker: false });

    const { container } = mount(<PushToggle />);
    await settle();

    expect(container).toBeEmptyDOMElement();
  });
});

describe("recuadro del repartidor — ADMIN-PWA-15", () => {
  it("se ve arriba mientras no tenga avisos y activa con el mismo botón", async () => {
    mount(<PushToggle variant="banner" />);

    expect(await screen.findByText("Activá los avisos para enterarte de los pedidos nuevos")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Activar avisos" }));
    await waitFor(() => expect(actions.savePushSubscriptionAction).toHaveBeenCalled());
  });

  it("desaparece cuando los avisos están activados", async () => {
    setEnv({ permission: "granted" });
    browser.getSubscription.mockResolvedValue({ endpoint: SUBSCRIPTION.endpoint });

    const { container } = mount(<PushToggle variant="banner" />);
    await settle();

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});

describe("Instalar app — ADMIN-PWA-12", () => {
  const installEvent = () => {
    const event = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
      prompt: ReturnType<typeof vi.fn>;
      userChoice: Promise<{ outcome: string }>;
    };
    event.prompt = vi.fn(async () => undefined);
    event.userChoice = Promise.resolve({ outcome: "accepted" });
    return event;
  };

  it("no se ve hasta que el navegador ofrece instalar, y al tocar llama a prompt()", async () => {
    mount(
      <>
        <ServiceWorkerRegister />
        <InstallAppButton />
      </>,
    );
    await settle();
    expect(screen.queryByRole("button", { name: /Instalar app/ })).not.toBeInTheDocument();

    const event = installEvent();
    act(() => {
      window.dispatchEvent(event);
    });

    // El navegador no muestra su propio cartel: la instalación es con el botón.
    expect(event.defaultPrevented).toBe(true);

    fireEvent.click(await screen.findByRole("button", { name: /Instalar app/ }));
    await waitFor(() => expect(event.prompt).toHaveBeenCalled());

    // Una vez instalada, deja de verse.
    await waitFor(() => expect(screen.queryByRole("button", { name: /Instalar app/ })).not.toBeInTheDocument());
  });

  it("después de appinstalled deja de verse", async () => {
    mount(
      <>
        <ServiceWorkerRegister />
        <InstallAppButton />
      </>,
    );
    await settle();

    act(() => {
      window.dispatchEvent(installEvent());
    });
    expect(await screen.findByRole("button", { name: /Instalar app/ })).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    await waitFor(() => expect(screen.queryByRole("button", { name: /Instalar app/ })).not.toBeInTheDocument());
  });

  it("en iPhone abre los pasos de Compartir → Agregar a inicio", async () => {
    setEnv({ isIOS: true, hasPushManager: false });

    mount(<InstallAppButton />);
    fireEvent.click(await screen.findByRole("button", { name: /Instalar app/ }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Compartir");
    expect(dialog).toHaveTextContent("Agregar a inicio");
  });

  it("no se ve si ya está instalada", async () => {
    setEnv({ isIOS: true, standalone: true });

    const { container } = mount(<InstallAppButton />);
    await settle();

    expect(container).toBeEmptyDOMElement();
  });
});

describe("registro del service worker", () => {
  it("se registra al montar los layouts", async () => {
    mount(<ServiceWorkerRegister />);
    await settle();

    expect(browser.registerServiceWorker).toHaveBeenCalledTimes(1);
  });
});
