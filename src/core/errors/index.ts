export class ErroDeDominio extends Error {
  constructor(
    mensagem: string,
    readonly codigo: string,
  ) {
    super(mensagem)
    this.name = new.target.name
  }
}

export class SemTenantError extends ErroDeDominio {
  constructor() {
    super('Operação de banco tentada fora de um contexto de tenant.', 'SEM_TENANT')
  }
}

export class NaoAutenticadoError extends ErroDeDominio {
  constructor() {
    super('É preciso entrar para continuar.', 'NAO_AUTENTICADO')
  }
}

export class SemPermissaoError extends ErroDeDominio {
  constructor(readonly permissao: string) {
    super('Você não tem permissão para esta ação.', 'SEM_PERMISSAO')
  }
}

export class CredenciaisInvalidasError extends ErroDeDominio {
  constructor() {
    // Mensagem deliberadamente genérica: não revela se o identificador existe.
    super('Dados de acesso incorretos.', 'CREDENCIAIS_INVALIDAS')
  }
}

export class BloqueadoPorTentativasError extends ErroDeDominio {
  constructor(readonly segundosRestantes: number) {
    super(
      `Muitas tentativas. Tente de novo em ${Math.ceil(segundosRestantes / 60)} minuto(s).`,
      'BLOQUEADO_POR_TENTATIVAS',
    )
  }
}
