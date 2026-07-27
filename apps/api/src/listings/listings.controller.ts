import { Body, Controller, ForbiddenException, Inject, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { AuthService } from "../auth/auth.service";

@Controller("v1/listings")
export class ListingsController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post()
  @UseGuards(AuthGuard)
  createListing(@Req() request: { currentUserId: string }, @Body() body: { title?: string }) {
    const currentUser = this.authService.getUserById(request.currentUserId);

    if (currentUser.role !== "tuner") {
      throw new ForbiddenException("Tuner role required");
    }

    return {
      created: true,
      listing: {
        title: body.title ?? "Untitled"
      }
    };
  }
}
