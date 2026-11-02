import { IsOptional, IsString, MaxLength } from 'class-validator';

export class GenerateCourseDto {
  @IsString()
  @MaxLength(200)
  topic: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  hint?: string;
}

export class GenerateDegreeDto {
  @IsString()
  @MaxLength(200)
  topic: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  hint?: string;
}
