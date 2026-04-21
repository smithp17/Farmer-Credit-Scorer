from enum import Enum
from pydantic import BaseModel, field_validator, model_validator
from typing import Annotated
from pydantic import Field


class IncomeBand(str, Enum):
    lt_2L = "<2L"
    bt_2_5L = "2-5L"
    bt_5_10L = "5-10L"
    gt_10L = ">10L"


class ScoreRequest(BaseModel):
    land_area_acres: float = Field(..., description="Land area in acres; must be positive")
    crop_type: str = Field(..., description="Non-empty crop label")
    repayment_history_score: float = Field(..., description="Score between 0 and 100 inclusive")
    annual_income_band: IncomeBand

    @field_validator("land_area_acres")
    @classmethod
    def land_must_be_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("land_area_acres must be greater than 0")
        return v

    @field_validator("crop_type")
    @classmethod
    def crop_must_be_non_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("crop_type must not be empty")
        return v.strip()

    @field_validator("repayment_history_score")
    @classmethod
    def repayment_must_be_in_range(cls, v: float) -> float:
        if v < 0 or v > 100:
            raise ValueError("repayment_history_score must be between 0 and 100 inclusive")
        return v


class ScoreResponse(BaseModel):
    request_id: str
    score: float
    reason_codes: list[str]
    timestamp: str
