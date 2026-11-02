from .common import CamelModel


class TeamMemberRead(CamelModel):
    id: str
    name: str
    role: str
    initials: str


class TeamMemberWrite(CamelModel):
    id: str
    name: str
    role: str
    initials: str
