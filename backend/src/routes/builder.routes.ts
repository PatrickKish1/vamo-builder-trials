import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import * as builderController from "../controllers/builder.controller.js";

export const builderRouter: Router = Router();

builderRouter.get("/projects", (req, res, next) => {
  builderController.listBuilderProjects(req, res).catch(next);
});
builderRouter.get("/invite", (req, res, next) => {
  builderController.getInvite(req, res).catch(next);
});
builderRouter.post("/invite/accept", (req, res, next) => {
  builderController.acceptInvite(req, res).catch(next);
});
builderRouter.post("/projects/:projectId/collaborators", (req, res, next) => {
  builderController.addCollaborator(req, res).catch(next);
});
builderRouter.get("/projects/:projectId/collaborators", (req, res, next) => {
  builderController.listCollaborators(req, res).catch(next);
});
builderRouter.post("/projects/:projectId/clone", (req, res, next) => {
  builderController.cloneProject(req, res).catch(next);
});
builderRouter.post("/suggest-project", (req, res, next) => {
  builderController.suggestProject(req, res).catch(next);
});
builderRouter.post("/projects", (req, res, next) => {
  builderController.createBuilderProject(req, res).catch(next);
});
builderRouter.patch("/projects", (req, res, next) => {
  builderController.updateBuilderProject(req, res).catch(next);
});
builderRouter.delete("/projects", (req, res, next) => {
  builderController.deleteBuilderProject(req, res).catch(next);
});
builderRouter.get("/auth-check", (req, res, next) => {
  builderController.authCheck(req, res).catch(next);
});
builderRouter.post("/auth-check", (req, res, next) => {
  builderController.authCheck(req, res).catch(next);
});
builderRouter.post("/scaffold", (req, res, next) => {
  builderController.scaffold(req, res).catch(next);
});
builderRouter.post("/preview/start", (req, res, next) => {
  builderController.previewStart(req, res).catch(next);
});
builderRouter.get("/preview/errors", (req, res, next) => {
  builderController.getPreviewErrors(req, res).catch(next);
});
builderRouter.post("/projects/:projectId/run-command", (req, res, next) => {
  builderController.runProjectCommand(req, res).catch(next);
});
builderRouter.get("/files", (req, res, next) => {
  builderController.listFiles(req, res).catch(next);
});
builderRouter.post("/projects/:projectId/pause", (req, res, next) => {
  builderController.pauseSandbox(req, res).catch(next);
});
builderRouter.post("/projects/:projectId/sync-from-sandbox", (req, res, next) => {
  builderController.syncFromSandbox(req, res).catch(next);
});
builderRouter.use("/projects/:projectId/preview-proxy", (req, res, next) => {
  if (req.method !== "GET") return next();
  builderController.proxyPreview(req, res).catch(next);
});
builderRouter.get("/projects/:projectId/export", (req, res, next) => {
  builderController.exportZip(req, res).catch(next);
});
builderRouter.post("/files", (req, res, next) => {
  builderController.applyFile(req, res).catch(next);
});
builderRouter.post("/generate-file", (req, res, next) => {
  builderController.generateFile(req, res).catch(next);
});
builderRouter.get("/marketplace", (req, res, next) => {
  builderController.listMarketplace(req, res).catch(next);
});
builderRouter.get("/marketplace/:projectId", (req, res, next) => {
  builderController.getMarketplaceProject(req, res).catch(next);
});
builderRouter.get("/marketplace/:projectId/bids", (req, res, next) => {
  builderController.listMarketplaceBids(req, res).catch(next);
});
builderRouter.post("/marketplace/:projectId/bids", (req, res, next) => {
  builderController.createMarketplaceBid(req, res).catch(next);
});
builderRouter.post("/marketplace/bids/:bidId/accept", (req, res, next) => {
  builderController.acceptMarketplaceBid(req, res).catch(next);
});
builderRouter.post("/projects/:projectId/list-for-sale", (req, res, next) => {
  builderController.listProjectForSale(req, res).catch(next);
});
builderRouter.post("/projects/:projectId/generate-logo", requireAuth, (req, res, next) => {
  builderController.generateProjectLogo(req, res).catch(next);
});
builderRouter.post("/logo-preview", requireAuth, (req, res, next) => {
  builderController.logoPreview(req, res).catch(next);
});
builderRouter.post("/upload-logo", (req, res, next) => {
  builderController.uploadLogo(req, res).catch(next);
});
builderRouter.post("/projects/:projectId/upload-logo", (req, res, next) => {
  builderController.uploadProjectLogo(req, res).catch(next);
});
builderRouter.post("/projects/:projectId/integrations/github/connect", (req, res, next) => {
  builderController.connectGitHub(req, res).catch(next);
});
builderRouter.post("/projects/:projectId/integrations/github/sync", (req, res, next) => {
  builderController.syncGitHub(req, res).catch(next);
});
builderRouter.post("/projects/:projectId/publish/vercel", (req, res, next) => {
  builderController.publishVercel(req, res).catch(next);
});
builderRouter.post("/projects/:projectId/offer", (req, res, next) => {
  builderController.getInstantOffer(req, res).catch(next);
});
builderRouter.get("/projects/:projectId/export", (req, res, next) => {
  builderController.exportProject(req, res).catch(next);
});
